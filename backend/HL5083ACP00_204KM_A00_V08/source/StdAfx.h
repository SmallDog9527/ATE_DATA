// stdafx.h : include file for standard system include files,
//  or project specific include files that are used frequently, but
//      are changed infrequently
//

#if !defined(AFX_STDAFX_H__3811CD50_B7B0_42B9_9E73_805A91708537__INCLUDED_)
#define AFX_STDAFX_H__3811CD50_B7B0_42B9_9E73_805A91708537__INCLUDED_

#if _MSC_VER > 1000
#pragma once
#endif // _MSC_VER > 1000


#define SITE_NUM 2
//#define SITE_NUM 4
#define BANK_NUM 44
//#define I2C_DEVICE_ADDR_FRESH		0xAA //use 8bit write address
//#define I2C_DEVICE_ADDR				0xAA //use 8bit write address
//#define I2C_DEVICE_ADDR_Tecno		0xAA //use 8bit write address
const float I2C_VIH_VOLTAGE = (float)(3.3); //  
const float I2C_VIL_VOLTAGE = (float)(0.1);//  
const float I2C_VOH_VOLTAGE = (float)(2.5); //  
const float I2C_VOL_VOLTAGE = (float)(0.5);// 
const float I2C_PERIOD = (float)(10e-6); // 100K
//const float I2C_PERIOD = (float)(2.5e-6); // 400K


#define Len_4    4
#define Len_8    8
#define Len_16   16
#define Len_32   32
#define Len_64   64
#define Len_128  128
#define Len_256  256

#define I2C_TM_INSTRUCTION		0x71   
#define I2C_TM_DATA 0x72
#define I2C_PREVIEW 0x74
#define I2C_READ 0x75
extern int globalsite/*,globalsite_idx*/;
//#define assert(_Expression) (void)( (!!(_Expression)) || (_wassert(_CRT_WIDE(#_Expression), _CRT_WIDE(__FILE__), __LINE__), 0) )
#define SITE globalsite
#define SERIAL \
        for(globalsite=0;globalsite<SITE_NUM;globalsite++) \

// Insert your headers here
#define WIN32_LEAN_AND_MEAN		// Exclude rarely-used stuff from Windows headers
#include <windows.h>

#define DUT_API extern "C" __declspec(dllexport)
#include <string>
using namespace std;
#include "usertype.h"
#include "userres.h"

#include "SPEC.h"
#include "treg.h"

extern TREG dut;
extern int I2C_DEVICE_ADDR, I2C_DEVICE_ADDR_Tecno;
extern int PN_flag;

typedef std::map<int, map<int, DWORD>> dualarry;

#define mA *1e3
#define uA *1e6
#define mV *1e3
#define uV *1e6
#define qtmu_hz *1e3
#define Mhz *1e-6
#define Khz *1e-3
#define uS *1
#define nS *1e3
#define mS *1e-3

#define Neg2Pos *-1
#define Kohm *1e-3
#define Mohm *1e-6
#define mohm *1e3



////////////////////////// FVOI /////////////////////////
extern FOVI fovi0;            
extern FOVI fovi1;            
extern FOVI fovi2;            
extern FOVI fovi3;            
extern FOVI fovi4;            
extern FOVI fovi5;            
extern FOVI fovi6;            
extern FOVI fovi7;            
extern FOVI fovi32;           
extern FOVI fovi33;           
extern FOVI fovi34;           
extern FOVI fovi35;           
                              
                              
extern FOVI fovi8;            
extern FOVI fovi9;            
extern FOVI fovi10;           
extern FOVI fovi11;           
extern FOVI fovi12;           
extern FOVI fovi13;           
extern FOVI fovi14;           
extern FOVI fovi15;           
extern FOVI fovi36;           
extern FOVI fovi37;           
extern FOVI fovi38;           
extern FOVI fovi39;    


extern  FOVI& FOVBUS_P1 ;
extern  FOVI& FOINTB ;
extern  FOVI& CC1_P0 ;
extern  FOVI& CC1_P1 ;
extern  FOVI& CC2_P0 ;
extern  FOVI& CC2_P1 ;
extern  FOVI& SBU1_P0 ;
extern  FOVI& SBU1_P1 ;
extern  FOVI& SBU2_P0;
extern  FOVI& SBU2_P1;
extern  FOVI& SBU_OVP_P0 ;
extern  FOVI& SBU_OVP_P1 ;
extern  FOVI& FRS_EN_P0 ;
extern  FOVI& FRS_EN_P1 ;
extern  FOVI& SBU1_OUT_P0 ;
extern  FOVI& SBU1_OUT_P1 ;
extern  FOVI& PA_20V5A_OFF;
extern  FOVI& PB_20V5A_OFF;
extern  FOVI& VBUS_DIV_P0;
extern  FOVI& VBUS_DIV_P1;
extern  FOVI& CC1_SYS_P0;
extern  FOVI& CC1_SYS_P1;
extern  FOVI& CC2_SYS_P0;
extern  FOVI& CC2_SYS_P1;
extern  FOVI& SRC_CUR_P0;
extern  FOVI& SRC_CUR_P1;
extern  FOVI& VDDIO;
extern  FOVI& VOPOUT;
extern  FOVI& SNK_CTL_P0;
extern  FOVI& SNK_CTL_P1;
extern  FOVI& SBU2_OUT_P0 ;
extern  FOVI& SBU2_OUT_P1 ;
extern  FOVI& VBUS_OUT_SNS_P0 ;
extern  FOVI& VBUS_OUT_SNS_P1 ;
extern  FOVI& SITEBDCK;
extern  FOVI&  CESD;

extern  FOVI&  SDA;
extern  FOVI&  SCL;
extern  FOVI&  INTB;
extern  FOVI&  PULLSOURCE_V5V_DIV;
extern  FOVI& I2C_R_UP;
extern  FOVI& INTB_R_UP;
extern  FOVI& FO_V5V;
extern  FOVI& VIN_3V3;

extern  FOVI& V5V_DIV;
extern  FOVI& PRD2_P0;
extern  FOVI& LDO3V3;

extern  FOVI& RPD1_P0;
extern  FOVI& RPD1_P1;
extern  FOVI& RPD2_P0;
extern  FOVI& RPD2_P1;

////////////////////////// FPVI /////////////////////////
extern FPVI10 fpvi0  ;                  
extern FPVI10 fpvi1  ;                  
extern FPVI10 fpvi2  ;                  
extern FPVI10 fpvi3  ;   

                                       
extern FPVI10& V5VtoVBUS0 ;             
extern FPVI10& V5VtoVBUS1 ;    

extern FPVI10& VBUSOUT0toVBUS0;
extern FPVI10& VBUSOUT1toVBUS1;
                                        
extern FPVI10& V5VtoCC1_P0 ;  //Vconn1 P0          
extern FPVI10& V5VtoCC2_P0 ;  //Vconn2 P0          
extern FPVI10& V5VtoCC1_P1 ;  //Vconn1 P1           
extern FPVI10& V5VtoCC2_P1 ;  //Vconn2 P1           
                                        
extern FPVI10& V5V ;                    
                                        
extern FPVI10& VBUSP0  ;                
extern FPVI10& VBUSP1  ;                
                          

////////////////////////// DIO /////////////////////////

extern DIO dio;


////////////////////////// QTMU /////////////////////////

extern QTMU_PLUS qtmu0;
extern QTMU_PLUS qtmu1;


////////////////////////// QVM /////////////////////////

extern QVM     qvm0;
extern QVM     qvm1;
extern QVM     qvm2;
extern QVM     qvm3;

////////////////////////// CBIT /////////////////////////

extern CBIT128 cbit;

               
                               

////////////Relay resource//////////

#define K0_TSSxLDO1_2                  0,0+64   
#define K1_FPxVBUSP01                  1,1+64   
#define K2_FOxSBU1_P01                 2,2+64   
#define K3_FOxSBU2_P01                 3,3+64   
#define K4_FOxCC1_P01                  4,4+64   
#define K5_FOxCC2_P01                  5,5+64   
#define K6_FOxCESD                     6,6+64   
#define K7_FOxPRD1_P0                  7,7+64   
#define K8_FPxV5V                      8,8+64   
#define K9_FOxI2C_Pullup               9,9+64   
#define K10_FOxINB_Pullup              10,10+64 
#define K11_DIOxI2C                    11,11+64 
#define K12_FOxSDA                     12,12+64 
#define K13_FOxSCL                     13,13+64 
#define K14_FOxINTB                    14,14+64 
#define K15_FOSC                       15,15+64 
#define K16_FOxPRD1_P1                 16,16+64 
#define K17_FOxPRD2_P1                 17,17+64 
#define K18_FOxV5V_DIV                 18,18+64 
#define K19_FOxV5V_DIV_Buffer          19,19+64 
#define K20_FOxSNK_CTL_P01             20,20+64 
#define K21_FOxSBU_OVP_P01             21,21+64 
#define K22_FOxSBU1_OUT_P01            22,22+64 
#define K23_FOxFRS_EN_P01              23,23+64 
#define K24_FOxSBU2_OUT_P01            24,24+64 
#define K25_FOxCC1SYS_P01              25,25+64 
#define K26_FOxCC2SYS_P01              26,26+64 
#define K27_FOxLDO3V3                  27,27+64
#define K28_FOxPRD2_P0                 28,28+64 
#define K29_FOxVBUS_OUT_SNS_P01        29,29+64 
#define K32_FOxVBUSDIV_P01             32,32+64 
#define K33_FOx20V5A_OFF_P01           33,33+64 
#define K34_SNKCTL_5MohmxGND           34,34+64 
#define K35_FOxSRC_CUR_P01             35,35+64 
#define K36_FOxVBUS_P1_INTB            36,36+64 
#define K37_FP0HxV5V                   37,37+64 
#define K38_FP0LxVBUSP0                38,38+64 
#define K39_FP0LxVBUSP1                39,39+64 
#define K40_FP1HxV5V                   40,40+64 
#define K41_FP1LxCC1P0                 41,41+64 
#define K42_FP1LxCC2P0                 42,42+64 
#define K43_FP1LxCC1P1                 43,43+64 
#define K44_FP1LxCC2P1                 44,44+64 
#define K45_GPIO8_1MohmxGNDxPULLUP     45,45+64 
#define K46_CAPxVBUS_LDO               46,46+64 
#define K47_CAPxV5V_VIN3V3             47,47+64 
#define K48_TSSxVBUSP0                 48,48+64 
#define K49_TSSxVBUSP1                 49,49+64 
#define K50_TSSxCC1P01                 50,50+64 
#define K51_TSSxCC2P01                 51,51+64 
#define K52_SCANxINxEN                 52,52+64 

#define K53_FP0HxVBUSOUTP0             53,53+64 
#define K54_FP0HxVBUSOUTP1             54,54+64 

#define K55_V5V_P01              55,55+64 

#define K56_RDSONxAUXN01               56,56+64 
#define K57_RDSONxSBRXP01              57,57+64 
#define K58_RDSONxCC1SYSP01            58,58+64 
#define K59_RDSONxCC2SYSP01            59,59+64 
#define K60_RDSONxDBGPN_P1             60,60+64 
#define K61_SITE_BDxCK                 61,61+64 

#define K30_TMUB_TMUA                  30,30+64




typedef struct trm_tb{
	int code;
	double value;
} TRM_TB;

class I2C_Class{
public:
	void Write(int RegAddress, int WriteData);
	void Write(int RegAddress, int WriteData[SITE_NUM]);
	void Read(int RegAddress, int SlaveData[]);
	void Read(int ChipAddr, int RegAddress, int ReadData[]);
	void Write(int RegAddress, int WriteData, BYTE Mask);
	void Write(int RegAddress, int WriteData[SITE_NUM], BYTE Mask);
	void Write(int ChipAddr, int RegAddress, int WriteData, BYTE Mask);
	void Write(int ChipAddr, int RegAddress, int WriteData[SITE_NUM], BYTE Mask);
};

class MyGetResult_Test{
public:
	void CalcAverage(int pdata[SITE_NUM][100], int bits, int average_result[SITE_NUM]);
	void CalcAverage(double pdata[SITE_NUM][100], int bits, double average_result[SITE_NUM]);
	void ADCCalcAverage(int RegH, int RegL, int bits, int average_result[SITE_NUM]);
	void GetXYCoordinate();
	void iin_regulation_bpm(double Itarget, int *reg_isgn, int *reg_fvt, int *reg_avt, double start_vin, double end_vin, double step_scan, int start_code, int end_code, TRIM_NODE &TrmNode, BYTE reg_addr, char *treg_assy_name, double *vin_trigged, int *trmcode, double *result_out);
	void iin_regulation_bpm(double Itarget, int *reg_isgn, int *reg_fvt, int *reg_avt, double *vin, int start_code, int end_code, TRIM_NODE &TrmNode, BYTE reg_addr, char *treg_assy_name, int *trmcode, double *result_out);
	void qdl_reget(FOVI FO_Resource, double TGT, TRM_TB *trm_tb, int trmtb_len, int reg_adr, TRIM_NODE &trm_node, char Treg_Assy_Name[10], int *trmcd_in, double *result_in, int *trmcd_out, double *result_out, int scan_len);
	void dql_BSearch(FOVI FO_Resource, double data_typical, int start_code, int end_code, int mid_code, TRM_TB *tab_name, int otpaddr, TRIM_NODE &trm_node, char Treg_Assy_Name[10], int index_num, int *trm_code);
	void afa_out_reget(FOVI FO_Resource, double TGT, TRM_TB *trm_tb, int trmtb_len, int reg_adr, TRIM_NODE &trm_node, char Treg_Assy_Name[10], int *trmcd_in, double *result_in, int *trmcd_out, double *result_out, int scan_len);
	void afa_out_BSearch(FOVI FO_Resource, double data_typical, int start_code, int end_code, int mid_code, TRM_TB *tab_name, int otpaddr, TRIM_NODE &trm_node, char Treg_Assy_Name[10], int index_num, int *trm_code);
};

void dio_run_error_index(DIO &dio, char * beginLabel, char * endLabel, DWORD *errAddr, WORD *errData, int *errIndex, int failCnt);
extern void trim_tb(int value);
extern void OTP_Preview_Byte(BYTE SlaveAddress, BYTE RegAddress, const char* reg_str);


// TODO: reference additional headers your program requires here

//{{AFX_INSERT_LOCATION}}
// Microsoft Visual C++ will insert additional declarations immediately before the previous line.

#endif // !defined(AFX_STDAFX_H__3811CD50_B7B0_42B9_9E73_805A91708537__INCLUDED_)
